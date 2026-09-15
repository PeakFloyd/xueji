package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.Course;

/**
 * 课程 数据访问对象(DAO)。
 */
public class CourseDao {

    /**
     * 查询所有课程。
     *
     * @return 课程列表
     */
    public List<Course> findAll() {
        List<Course> list = new ArrayList<>();
        String sql = "SELECT course_id, course_name, credit FROM course ORDER BY course_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("查询课程失败", e);
        }
        return list;
    }

    /**
     * 按课程号查询。
     *
     * @param courseId 课程号
     * @return 课程实体；不存在返回 null
     */
    public Course findById(String courseId) {
        String sql = "SELECT course_id, course_name, credit FROM course WHERE course_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, courseId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapRow(rs);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("按课程号查询失败", e);
        }
        return null;
    }

    /**
     * 新增课程。
     *
     * @param c 课程实体
     * @return 影响行数
     */
    public int insert(Course c) {
        String sql = "INSERT INTO course(course_id, course_name, credit) VALUES(?, ?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, c.getCourseId());
            ps.setString(2, c.getCourseName());
            ps.setInt(3, c.getCredit());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增课程失败（课程号可能重复）", e);
        }
    }

    /**
     * 更新课程。
     *
     * @param c 课程实体
     * @return 影响行数
     */
    public int update(Course c) {
        String sql = "UPDATE course SET course_name = ?, credit = ? WHERE course_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, c.getCourseName());
            ps.setInt(2, c.getCredit());
            ps.setString(3, c.getCourseId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("更新课程失败", e);
        }
    }

    /**
     * 删除课程。
     *
     * @param courseId 课程号
     * @return 影响行数
     */
    public int delete(String courseId) {
        String sql = "DELETE FROM course WHERE course_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, courseId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除课程失败（可能仍有选课记录）", e);
        }
    }

    private Course mapRow(ResultSet rs) throws Exception {
        Course c = new Course();
        c.setCourseId(rs.getString("course_id"));
        c.setCourseName(rs.getString("course_name"));
        c.setCredit(rs.getInt("credit"));
        return c;
    }
}
