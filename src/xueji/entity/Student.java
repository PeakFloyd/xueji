package xueji.entity;

/**
 * 学生实体，对应数据库表 student。
 * 学生隶属于某个班级（班号外键），班号再关联系。
 */
public class Student {

    /** 学号（主键）。 */
    private String stuId;

    /** 姓名。 */
    private String stuName;

    /** 性别（男/女）。 */
    private String gender;

    /** 所在班号（外键）。 */
    private String classId;

    public Student() {
    }

    public Student(String stuId, String stuName, String gender, String classId) {
        this.stuId = stuId;
        this.stuName = stuName;
        this.gender = gender;
        this.classId = classId;
    }

    public String getStuId() {
        return stuId;
    }

    public void setStuId(String stuId) {
        this.stuId = stuId;
    }

    public String getStuName() {
        return stuName;
    }

    public void setStuName(String stuName) {
        this.stuName = stuName;
    }

    public String getGender() {
        return gender;
    }

    public void setGender(String gender) {
        this.gender = gender;
    }

    public String getClassId() {
        return classId;
    }

    public void setClassId(String classId) {
        this.classId = classId;
    }

    @Override
    public String toString() {
        return stuName == null ? stuId : stuName;
    }
}
