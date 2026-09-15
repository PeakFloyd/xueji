package xueji.entity;

/**
 * 系(学院) 实体，对应数据库表 department。
 */
public class Department {

    /** 系号（主键）。 */
    private String deptId;

    /** 系名。 */
    private String deptName;

    public Department() {
    }

    public Department(String deptId, String deptName) {
        this.deptId = deptId;
        this.deptName = deptName;
    }

    public String getDeptId() {
        return deptId;
    }

    public void setDeptId(String deptId) {
        this.deptId = deptId;
    }

    public String getDeptName() {
        return deptName;
    }

    public void setDeptName(String deptName) {
        this.deptName = deptName;
    }

    @Override
    public String toString() {
        return deptName == null ? deptId : deptName;
    }
}
